import {Component, OnInit} from '@angular/core';
import { addMonths, set } from 'date-fns';
import {InfiniteScrollCustomEvent, ModalController, RefresherCustomEvent} from '@ionic/angular';
import { ExpenseModalComponent } from '../expense-modal/expense-modal.component';
import {Category, Expense, ExpenseCriteria, SortOption} from '../../shared/domain';
import {FormBuilder, FormGroup} from "@angular/forms";
import {ToastService} from "../../shared/service/toast.service";
import {CategoryService} from "../../category/category.service";
import {ExpenseService} from "../expense.service";
import {BehaviorSubject, debounce, from, groupBy, interval, mergeMap, Subject, takeUntil, toArray} from "rxjs";
import {formatPeriod} from "../../shared/period";

interface ExpenseGroup {
  date: string;
  expenses: Expense[];
}

@Component({
  selector: 'app-expense-overview',
  templateUrl: './expense-list.component.html',
})
export class ExpenseListComponent implements OnInit{
  date = set(new Date(), {date: 1});
  loading = false;
  expenseGroups: ExpenseGroup[] | null = null;
  readonly initialSort = 'date,desc';
  searchCriteria: ExpenseCriteria = {page: 0, size: 25, sort: this.initialSort};
  lastPageReached = false;
  categories: Category[] = [];

  readonly searchForm: FormGroup;
  readonly sortOptions: SortOption[] = [
    {label: 'Created at (newest first)', value: 'createdAt,desc'},
    {label: 'Created at (oldest first)', value: 'createdAt,asc'},
    {label: 'Name (A-Z)', value: 'name,asc'},
    {label: 'Name (Z-A)', value: 'name,desc'},
    {label: 'Date (newest first)', value: 'date,desc'},
    {label: 'Date (oldest first)', value: 'date,asc'},
  ];

  private readonly unsubscribe = new Subject<void>();
  loadNextExpensesPage($event: any) {
    this.searchCriteria.page++;
    this.loadExpenses(() => ($event as InfiniteScrollCustomEvent).target.complete());
  }
  reloadExpenses($event?: any): void {
    this.searchCriteria.page = 0;
    this.loadExpenses(() => ($event ? ($event as RefresherCustomEvent).target.complete() : {}));
  }
  constructor(
    private readonly modalCtrl: ModalController,
    private readonly toastService: ToastService,
    private readonly categoryService: CategoryService,
    private readonly expenseService: ExpenseService,
    private readonly formBuilder: FormBuilder,
  ) {
    this.searchForm = this.formBuilder.group({name: [], categoryIds: [], sort: [this.initialSort]});
    this.searchForm.valueChanges
      .pipe(
        takeUntil(this.unsubscribe),
        debounce((value) => (value.name?.length ? interval(400) : interval(0)))
      )
      .subscribe((value) => {
        this.searchCriteria = {...this.searchCriteria, ...value, page: 0};
        this.loadExpenses();
      })
  }

  addMonths = (number: number): void => {
    this.date = addMonths(this.date, number);
  };

  async openModal(expense?: Expense): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: ExpenseModalComponent,
      componentProps: {expense: expense ? {...expense} : {}},
    });
    modal.present();
    const {role} = await modal.onWillDismiss();
     if (role === 'refresh') this.reloadExpenses();
  }

  private loadAllCategories(): void {
    const pageToLoad = new BehaviorSubject(0);
    pageToLoad
      .pipe(mergeMap((page) => this.categoryService.getCategories({ page, size: 25, sort: 'name,asc'})))
      .subscribe({
        next: (categories) => {
          if (pageToLoad.value === 0) this.categories = [];
          this.categories.push(...categories.content);
          if (!categories.last) pageToLoad.next(pageToLoad.value + 1);
        },
        error: (error) => this.toastService.displayErrorToast('Could not load categories', error),
      });
  }

  private loadExpenses(next: () => void = () => {}): void {
    this.searchCriteria.yearMonth = formatPeriod(this.date);
    if (!this.searchCriteria.categoryIds?.length) delete this.searchCriteria.categoryIds;
    if (!this.searchCriteria.name) delete this.searchCriteria.name;
    this.loading = true;
    this.expenseService
      .getExpenses(this.searchCriteria)
      .pipe(
        mergeMap((expensePage) => {
          this.lastPageReached = expensePage.last;
          next();
          this.loading = false;
          if (this.searchCriteria.page === 0 || this.expenseGroups) this.expenseGroups = [];
          return from(expensePage.content).pipe(
            groupBy((expense) => expense.date),
            mergeMap((group) => group.pipe(toArray()))
          );
        })
      )
      .subscribe({
        next: (expenses: Expense[]) => {
          const expenseGroup: ExpenseGroup = {
            date: expenses[0].date,
            expenses: this.sortExpenses(expenses),
          };
          const expenseGroupWithSameDate = this.expenseGroups!.find((other) => other.date === expenseGroup.date);
          if (!expenseGroupWithSameDate) this.expenseGroups!.push(expenseGroup);
          else
            expenseGroupWithSameDate.expenses = this.sortExpenses([
              ...expenseGroupWithSameDate.expenses,
              ...expenseGroup.expenses,
            ]);
        },
        error: (error) => {
          this.toastService.displayErrorToast('Could not load expenses', error);
          this.loading = false;
        },
      });
  }
private sortExpenses = (expenses: Expense[]): Expense[] => expenses.sort((a, b) => a.name.localeCompare(b.name));

  ngOnInit(): void {
    this.loadExpenses();
    this.loadAllCategories();
  }
}
